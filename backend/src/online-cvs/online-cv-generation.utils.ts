import { createHash } from 'crypto';
import {
  CvDraftResponse,
  CvDraftReviewResponse,
  matchOwnedSkillMembers,
} from 'src/ai-matching/ai-service.client';
import { OnlineCV, OnlineCvLocale } from './entities/online-cv.entity';

const DEFAULT_CV_LOCALE: OnlineCvLocale = 'vi-VN';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Value is not JSON serializable');
  return encoded;
}

export function cvDraftHash(draft: CvDraftResponse): string {
  return createHash('sha256').update(stableJson(draft), 'utf8').digest('hex');
}

export function safeReviewWarnings(review: CvDraftReviewResponse): string[] {
  const warnings = new Set<string>();
  if (
    Object.values(review.review_metadata.field_origins_by_path).includes(
      'FALLBACK',
    )
  ) {
    warnings.add('FALLBACK_USED');
  }
  for (const omission of review.review_metadata.omissions_by_path) {
    warnings.add(omission.reason_code);
  }
  return [...warnings].slice(0, 20);
}

export function normalizeCvLocale(value: unknown): OnlineCvLocale {
  return value === 'en-US' ? 'en-US' : DEFAULT_CV_LOCALE;
}

export function skillLiteral(
  skill: string | { name?: string; description?: string | null },
): string {
  if (typeof skill === 'string') return skill.trim();
  const name = skill.name?.trim() || '';
  const description = skill.description?.trim();
  return name && description ? `${name} (${description})` : name;
}

export function currentCvSkillLiterals(cv: OnlineCV): string[] {
  const stored = cv.revision?.sourceTrace?.skillGroups;
  const groups: Array<{
    name: string;
    description?: string | null;
    members: string[];
  }> = [];
  if (Array.isArray(stored)) {
    for (const value of stored as unknown[]) {
      if (!value || typeof value !== 'object') continue;
      const group = value as Record<string, unknown>;
      const members =
        Array.isArray(group.members) &&
        group.members.every((member) => typeof member === 'string')
          ? (group.members as string[])
          : null;
      const matched =
        members && typeof group.description === 'string'
          ? matchOwnedSkillMembers(group.description, members)
          : null;
      if (
        typeof group.name === 'string' &&
        Array.isArray(group.members) &&
        group.members.every((member) => typeof member === 'string') &&
        (typeof group.description === 'string'
          ? matched?.length === members?.length &&
            matched?.every((member, index) => member === members?.[index])
          : group.description == null && group.members.length === 0)
      ) {
        groups.push({
          name: group.name,
          description: group.description as string | null,
          members: group.members as string[],
        });
      }
    }
  }
  return (cv.skills || []).flatMap((skill) => {
    const prior =
      groups.find(
        (group) =>
          group.name === skill.name && group.description === skill.description,
      ) || groups.find((group) => group.name === skill.name);
    if (!prior) return [skillLiteral(skill)].filter(Boolean);
    if (prior.description === skill.description) return prior.members;
    // A changed group description is current user-owned text, not old membership.
    return skill.description?.trim() ? [skill.description.trim()] : [];
  });
}

export function normalizeCvContentKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Preserve the first source item while removing presentation-only duplicates. */
export function dedupeCvText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const cleaned = value.trim().replace(/\s+/g, ' ');
    const key = normalizeCvContentKey(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function draftDescription(
  source: string | null | undefined,
  bullets: readonly string[] | undefined,
  generatedDescription: string | null | undefined,
): string | undefined {
  const sourceKey = source ? normalizeCvContentKey(source) : '';
  const uniqueBullets = dedupeCvText(bullets || []).filter(
    (bullet) => !sourceKey || normalizeCvContentKey(bullet) !== sourceKey,
  );
  return (
    uniqueBullets.join('\n') || generatedDescription || source || undefined
  );
}
