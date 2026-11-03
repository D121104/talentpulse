// Keep these aligned with cv_analysis/matching.py, skills.py and parser.py.
export const CURRENT_MATCH_SCORING_VERSION = 'cv-job-match-v3';
export const CURRENT_SKILL_NORMALIZATION_VERSION = 'skill-normalization-v2';
export const CURRENT_CV_PARSER_VERSION = 'structured-parser-v2';

export function hasCurrentMatchingVersions(result: {
  scoringVersion?: string;
  normalizationVersion?: string;
}): boolean {
  return (
    result.scoringVersion === CURRENT_MATCH_SCORING_VERSION &&
    result.normalizationVersion === CURRENT_SKILL_NORMALIZATION_VERSION
  );
}
