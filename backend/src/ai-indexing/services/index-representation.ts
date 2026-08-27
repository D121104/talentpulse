import { createHash } from 'crypto';
import { CanonicalJobSnapshot } from '../../ai-client/contracts/indexing.contracts';

/** These values are owned by the FastAPI index representation contract. */
export const DEFAULT_NORMALIZATION_VERSION = 'nfkc-html-whitespace-v1';
export const DEFAULT_CHUNKING_VERSION = 'section-greedy-v1';
export const DEFAULT_INDEX_SCHEMA_VERSION = 'job-index-v1';

export interface IndexRepresentationVersions {
  embeddingModelVersion: string;
  embeddingDimensions: number;
  normalizationVersion: string;
  chunkingVersion: string;
  indexSchemaVersion: string;
}

const HTML_SCRIPT_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const WHITESPACE_PATTERN = /\s+/gu;
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"',
};

/**
 * Mirrors the AI service's bounded text normalization for reconciliation.
 * This is intentionally pure and does not call an external parser.
 */
export function normalizeIndexText(value: string | null | undefined): string {
  if (!value) return '';
  const decoded = decodeHtmlEntities(value);
  return decoded
    .replace(HTML_SCRIPT_STYLE_PATTERN, ' ')
    .replace(HTML_TAG_PATTERN, ' ')
    .normalize('NFKC')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
    .toLowerCase()
    // Python's casefold expands these common Unicode case variants while
    // JavaScript's lower-case operation does not.
    .replace(/\u00df/g, 'ss')
    .replace(/\u1e9e/g, 'ss');
}

export function normalizedCanonicalJobMetadata(
  job: CanonicalJobSnapshot,
): Record<string, unknown> {
  const salary = normalizeSalary(job.salary, job.salary_currency);
  const dynamicJob = job as CanonicalJobSnapshot & {
    work_mode?: string | null;
    employment_type?: string | null;
  };

  return {
    job_id: job.job_id,
    company_id: job.company_id,
    title: normalizeIndexText(job.title),
    company_name: normalizeIndexText(job.company_name),
    skills: normalizeSkills(job.skills),
    location: normalizeOptionalText(job.location),
    level: normalizeOptionalText(job.level),
    work_mode: normalizeOptionalText(dynamicJob.work_mode),
    employment_type: normalizeOptionalText(dynamicJob.employment_type),
    salary: salary.amount,
    salary_currency: salary.currency,
    start_date: pythonUtcIso(job.start_date),
    end_date: pythonUtcIso(job.end_date),
    updated_at: pythonUtcIso(job.updated_at),
    is_active: job.is_active === true,
    is_deleted: job.is_deleted === true,
    deleted_at: pythonUtcIso(job.deleted_at),
    company_is_active: job.company_is_active === true,
    company_is_deleted: job.company_is_deleted === true,
    company_deleted_at: pythonUtcIso(job.company_deleted_at),
  };
}

export function buildCanonicalSearchText(job: CanonicalJobSnapshot): string {
  const metadata = normalizedCanonicalJobMetadata(job);
  const dynamicJob = job as CanonicalJobSnapshot & {
    work_mode?: string | null;
    employment_type?: string | null;
  };
  const sections: Array<[string, string | null]> = [
    ['title', stringValue(metadata.title)],
    ['company', stringValue(metadata.company_name)],
    ['level', stringValue(metadata.level)],
    ['location', stringValue(metadata.location)],
    ['work_mode', normalizeOptionalText(dynamicJob.work_mode)],
    ['employment_type', normalizeOptionalText(dynamicJob.employment_type)],
    ['skills', joinSkills(metadata.skills)],
    ['description', normalizeIndexText(job.description)],
  ];

  return sections
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}

export function computeCanonicalContentHash(job: CanonicalJobSnapshot): string {
  return sha256(normalizeIndexText(buildCanonicalSearchText(job)));
}

/**
 * Matches the AI service metadata hash. The source version is included by the
 * provider contract, so reconciliation calculates it using the current state
 * version before deciding whether a new command is needed.
 */
export function computeCanonicalMetadataHash(
  job: CanonicalJobSnapshot,
  sourceVersion: number,
  versions: IndexRepresentationVersions,
): string {
  const value = {
    job: normalizedCanonicalJobMetadata(job),
    source_version: sourceVersion,
    embedding_model_version: versions.embeddingModelVersion,
    embedding_dimensions: versions.embeddingDimensions,
    normalization_version: versions.normalizationVersion,
    chunking_version: versions.chunkingVersion,
    index_schema_version: versions.indexSchemaVersion,
  };

  return sha256(stableJsonStringify(value));
}

function normalizeSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((skill): skill is string => typeof skill === 'string')
      .map((skill) => normalizeIndexText(skill))
      .filter(Boolean),
  )].sort();
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeIndexText(value);
  return normalized || null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function joinSkills(value: unknown): string | null {
  return Array.isArray(value) && value.length > 0 ? value.join(', ') : null;
}

function normalizeSalary(
  value: CanonicalJobSnapshot['salary'],
  currency: string | null | undefined,
): { amount: number | null; currency: string | null } {
  let amount: unknown = value;
  let effectiveCurrency: unknown = currency;
  if (value && typeof value === 'object') {
    amount = value.amount;
    if (effectiveCurrency === undefined || effectiveCurrency === null) {
      effectiveCurrency = value.currency;
    }
  }

  const numeric =
    typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
      ? amount
      : null;
  const normalizedCurrency = normalizeOptionalText(effectiveCurrency);
  return {
    amount: numeric,
    currency: normalizedCurrency || (numeric === null ? null : 'vnd'),
  };
}

function pythonUtcIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return normalizeIndexText(String(value)) || null;

  const iso = date.toISOString();
  const milliseconds = date.getUTCMilliseconds();
  // datetime.isoformat() omits the fractional part when it is zero and emits
  // microseconds when it is non-zero; the FastAPI service then appends Z.
  return milliseconds === 0
    ? iso.replace('.000Z', 'Z')
    : iso.replace('Z', '000Z');
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi,
    (entity, body: string) => {
      const normalized = body.toLowerCase();
      if (normalized.startsWith('#x')) {
        const codePoint = Number.parseInt(normalized.slice(2), 16);
        return validCodePoint(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      if (normalized.startsWith('#')) {
        const codePoint = Number.parseInt(normalized.slice(1), 10);
        return validCodePoint(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      return HTML_ENTITIES[normalized] ?? entity;
    },
  );
}

function validCodePoint(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(',')}}`;
}
