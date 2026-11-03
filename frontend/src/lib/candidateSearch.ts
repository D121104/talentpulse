export const emptyCandidateSearch = {
  keyword: '', jobId: '', skills: '', location: '', education: '',
  minExperienceYears: '', maxExperienceYears: '',
  minExpectedSalary: '', maxExpectedSalary: '',
};

export function optionalCandidateNumber(value: string, max: number, integer = false): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) {
    throw new Error('invalidNumber');
  }
  return number;
}

export function candidateSearchQuery(criteria: typeof emptyCandidateSearch, advanced: boolean) {
  const base = { keyword: criteria.keyword.trim() || undefined, ...(criteria.jobId ? { jobId: criteria.jobId } : {}) };
  if (!advanced) return base;
  const minExperienceYears = optionalCandidateNumber(criteria.minExperienceYears, 100);
  const maxExperienceYears = optionalCandidateNumber(criteria.maxExperienceYears, 100);
  const minExpectedSalary = optionalCandidateNumber(criteria.minExpectedSalary, 2147483647, true);
  const maxExpectedSalary = optionalCandidateNumber(criteria.maxExpectedSalary, 2147483647, true);
  if ((minExperienceYears !== undefined && maxExperienceYears !== undefined && minExperienceYears > maxExperienceYears) ||
      (minExpectedSalary !== undefined && maxExpectedSalary !== undefined && minExpectedSalary > maxExpectedSalary)) {
    throw new Error('invalidRange');
  }
  return { ...base, skills: criteria.skills.trim() || undefined, location: criteria.location.trim() || undefined,
    education: criteria.education.trim() || undefined, minExperienceYears, maxExperienceYears, minExpectedSalary, maxExpectedSalary };
}
