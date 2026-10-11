import type { CVGenerationStatus, CVLocale } from "./cvTypes";

export type CVGenerationProvenance = "ai" | "mixed" | "fallback";

export interface NormalizedCvGenerationWarnings {
  provenance: CVGenerationProvenance;
  messages: string[];
}

// These values are telemetry for the editor, not copy for the person using it.
// Keep the match generic so new diagnostic/provenance values are hidden too.
const INTERNAL_WARNING_TOKEN =
  /\bcv_generation\.(?:provenance|diagnostic)=[^\s,;|]+/gi;
const INTERNAL_CV_TOKEN = /\bcv_generation\.[a-z_]+=[^\s,;|]+/gi;

const hasProvenance = (warnings: readonly string[], value: string): boolean =>
  warnings.some((warning) =>
    Array.from(warning.matchAll(INTERNAL_WARNING_TOKEN)).some(
      (match) =>
        match[0]
          .slice("cv_generation.provenance=".length)
          .split(":", 1)[0]
          .toLowerCase() === value,
    ),
  );

const hasFallbackSignal = (
  warnings: readonly string[],
  status: CVGenerationStatus,
): boolean =>
  status === "NO_EVIDENCE" ||
  hasProvenance(warnings, "fallback") ||
  warnings.some((warning) =>
    /\bcv_generation\.localization=fallback\b/i.test(warning) ||
    /fallback|provider\s+(?:output\s+)?(?:unavailable|invalid)|unavailable\s+or\s+invalid/i.test(
      warning,
    ),
  );

const localizedMessage = (locale: CVLocale, vi: string, en: string): string =>
  locale === "vi-VN" ? vi : en;

const isInsufficientEvidenceWarning = (warning: string): boolean =>
  /AI text was omitted|could not be grounded|insufficient (?:source )?evidence|not enough (?:source )?evidence/i.test(
    warning,
  );

const isProviderStatusWarning = (warning: string): boolean =>
  /AI structured output was unavailable|provider\s+(?:output\s+)?(?:unavailable|invalid)|unavailable\s+or\s+invalid/i.test(
    warning,
  );

const isFallbackReviewWarning = (warning: string): boolean =>
  /deterministic fallback|fallback bullets|review wording/i.test(warning);

const isPrivacyWarning = (warning: string): boolean =>
  /(?:pii|personal(?:ly)? identifiable|redact(?:ed|ion)?|contact (?:information|details|data)|sensitive data|privacy)/i.test(
    warning,
  );

const requestsPrivacyReview = (warning: string): boolean =>
  isPrivacyWarning(warning) &&
  /(?:review|check|confirm|update|provide|action|required|need|verify)/i.test(
    warning,
  );

/**
 * Converts generation diagnostics into the small set of messages useful in the
 * editor banner. Provider payloads are deliberately never rendered directly.
 */
export function normalizeCvGenerationWarnings(
  warnings: readonly string[],
  status: CVGenerationStatus,
  locale: CVLocale,
): NormalizedCvGenerationWarnings {
  const providerUsed =
    hasProvenance(warnings, "provider") ||
    warnings.some((warning) =>
      /\bcv_generation\.localization=provider\b/i.test(warning),
    );
  const fallbackUsed = hasFallbackSignal(warnings, status);
  const provenance: CVGenerationProvenance =
    providerUsed && fallbackUsed
      ? "mixed"
      : fallbackUsed
        ? "fallback"
        : "ai";
  const messages: string[] = [];
  const add = (message: string) => {
    if (!messages.includes(message)) messages.push(message);
  };

  for (const warning of warnings) {
    const normalized = warning.trim();
    if (!normalized) continue;

    // Strip all internal tokens, including new diagnostic values. If nothing
    // remains, this is telemetry only and must not create a warning row.
    const withoutInternalTokens = normalized
      .replace(INTERNAL_WARNING_TOKEN, " ")
      .replace(INTERNAL_CV_TOKEN, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!withoutInternalTokens) continue;

    if (isProviderStatusWarning(withoutInternalTokens)) continue;
    if (isInsufficientEvidenceWarning(withoutInternalTokens)) {
      add(
        localizedMessage(
          locale,
          "Chưa đủ dữ kiện nguồn để viết lại một số nội dung. Hãy bổ sung hồ sơ hoặc kiểm tra phần này.",
          "Some content could not be grounded in the source evidence. Add more profile details or review that section.",
        ),
      );
      continue;
    }
    if (requestsPrivacyReview(withoutInternalTokens)) {
      add(
        localizedMessage(
          locale,
          "Hãy kiểm tra lại thông tin liên hệ trước khi sử dụng CV.",
          "Review the contact information before using this CV.",
        ),
      );
      continue;
    }
    if (isPrivacyWarning(withoutInternalTokens)) continue;
    if (isFallbackReviewWarning(withoutInternalTokens)) {
      add(
        localizedMessage(
          locale,
          "Một số nội dung dùng phương án an toàn từ hồ sơ; hãy rà soát cách diễn đạt trước khi sử dụng.",
          "Some content uses a safe profile fallback; review the wording before using this CV.",
        ),
      );
      continue;
    }

    // Preserve an action without exposing arbitrary provider text, IDs, counts,
    // implementation reasons, or future internal warning formats.
    add(
      localizedMessage(
        locale,
        "Hãy rà soát nội dung CV trước khi sử dụng.",
        "Review the CV content before using it.",
      ),
    );
  }

  return { provenance, messages };
}
