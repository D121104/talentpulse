import type { HRMatchingAnalysis } from './employerApi';

export function narrativeEvidence(refs: string[], labels: Record<string, string>, analysis?: HRMatchingAnalysis, seenGeneric = new Set<string>()) {
  const seen = new Set<string>();
  const specific = refs.some(ref => /^[mg]\d+$/.test(ref));
  return refs.flatMap(ref => {
    const skill = /^([mg])(0|[1-9]\d*)$/.exec(ref);
    const fallback = skill && analysis?.components.skills.available
      ? (skill[1] === 'm' ? analysis.matchedSkills : analysis.missingRequiredSkills)[Number(skill[2])]
      : undefined;
    const label = (Object.prototype.hasOwnProperty.call(labels, ref) ? labels[ref] : fallback)?.trim();
    if (!label || (ref === 'skills' && specific)) return [];
    const key = label.toLocaleLowerCase();
    if (seen.has(key) || (!skill && seenGeneric.has(key))) return [];
    seen.add(key);
    if (!skill) seenGeneric.add(key);
    return [{ label, kind: skill ? (skill[1] === 'm' ? 'matched' : 'verify') : 'context' }];
  });
}
