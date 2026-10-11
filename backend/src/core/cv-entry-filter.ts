export type CvEntryRecord = Record<string, unknown>;

/**
 * A CV entry is meaningful when at least one user-facing text or list value
 * contains non-whitespace content. Empty editor placeholders are ignored,
 * while partially completed entries remain intact.
 */
export function hasMeaningfulCvEntry(value: unknown): value is CvEntryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  return Object.values(value as CvEntryRecord).some((field) => {
    if (typeof field === 'string') return field.trim().length > 0;
    if (Array.isArray(field)) {
      return field.some(
        (item) => typeof item === 'string' && item.trim().length > 0,
      );
    }
    return false;
  });
}

export function normalizeCvEntry<T extends object>(entry: T): T {
  const normalized = Object.fromEntries(
    Object.entries(entry).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? value.trim()
        : Array.isArray(value)
        ? value
            .filter((item) => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : value,
    ]),
  );
  return normalized as T;
}

export function filterMeaningfulCvEntries<T extends object>(
  entries: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(entries)) return [];
  return entries.map(normalizeCvEntry).filter(hasMeaningfulCvEntry) as T[];
}

export const ONLINE_CV_ENTRY_COLLECTIONS = [
  'education',
  'workExperience',
  'skills',
  'activities',
  'projects',
  'certificates',
  'awards',
] as const;

export function normalizeCvEntryCollections<T extends object>(value: T): T {
  const normalized = { ...value } as CvEntryRecord;
  for (const key of ONLINE_CV_ENTRY_COLLECTIONS) {
    const entries = normalized[key];
    if (Array.isArray(entries)) {
      normalized[key] = filterMeaningfulCvEntries(entries as CvEntryRecord[]);
    }
  }
  return normalized as T;
}
