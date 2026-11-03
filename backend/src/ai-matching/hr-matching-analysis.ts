import { CVMatchResult } from './entities/cv-match-result.entity';
import {
  Application,
  ApplicationStatus,
} from 'src/applications/entities/application.entity';
import { getJobSourceVersion } from 'src/job-indexing/job-indexing.normalization';
import { hasCurrentMatchingVersions } from './matching-versions';
import { ApplicationAiScoreSummary } from 'src/applications/dto/application-ai-score.dto';
import {
  IHRMatchingAnalysis,
  IMatchingAnalysisComponent,
} from './dto/ai-match-result.dto';

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && !!item.trim(),
      )
    : [];
}

function unit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function component(
  value: unknown,
  compatibility = false,
): IMatchingAnalysisComponent {
  const input = record(value);
  const available =
    input.available === true && unit(input.score) && unit(input.weight);
  return {
    score: available && unit(input.score) ? input.score : null,
    weight:
      available && !compatibility && unit(input.weight) ? input.weight : 0,
    available,
    evidence: texts(input.evidence),
  };
}

/** Project JSONB onto a closed public contract; never forward provider objects. */
export function mapHRMatchingAnalysis(
  result: CVMatchResult,
): IHRMatchingAnalysis {
  const components = record(result.components);
  const compatibility = record(result.compatibility);
  const explanation = text(result.explanation);
  // The persisted v2 and v3 pipelines explicitly request English. Older rows
  // do not persist provenance/locale, so do not guess or claim translation.
  const knownVersion = ['cv-job-match-v2', 'cv-job-match-v3'].includes(
    result.scoringVersion,
  );
  const locale = knownVersion ? 'en' : 'und';
  return {
    source: 'persisted_cv_match_result',
    textLocale: locale,
    components: {
      semantic: component(components.semantic),
      skills: component(components.skills),
      experience: component(components.experience),
    },
    compatibility: {
      location: component(components.location ?? compatibility.location, true),
      workMode: component(components.work_mode ?? compatibility.workMode, true),
    },
    matchedSkills: texts(result.matchedSkills),
    missingRequiredSkills: texts(result.missingSkills),
    strengths: texts(compatibility.strengths),
    gaps: texts(compatibility.gaps),
    versions: {
      scoring: text(result.scoringVersion),
      model: text(result.modelVersion),
      normalization: text(result.normalizationVersion),
    },
    degraded: typeof result.degraded === 'boolean' ? result.degraded : null,
    explanation: {
      text: explanation,
      source: !explanation
        ? 'unavailable'
        : knownVersion
        ? 'deterministic_matching'
        : 'stored_unknown',
      locale: explanation ? locale : 'und',
    },
  };
}

export function applicationAiScore(
  app: Application,
  result?: CVMatchResult,
): ApplicationAiScoreSummary {
  if (
    !app.aiRankingConsentGranted ||
    !app.aiRankingConsentVersion ||
    !app.aiRankingConsentPolicyHash ||
    !app.aiRankingConsentAt ||
    app.isDeleted ||
    app.deletedAt ||
    ![
      ApplicationStatus.PENDING,
      ApplicationStatus.REVIEWING,
      ApplicationStatus.CONSIDERING,
      ApplicationStatus.APPROVED,
    ].includes(app.status) ||
    !app.cv ||
    app.cv._id !== app.cvId ||
    app.cv.userId !== app.userId ||
    app.cv.isDeleted ||
    app.cv.deletedAt ||
    !app.user ||
    app.user._id !== app.userId ||
    app.user.isDeleted ||
    app.user.deletedAt
  ) {
    return { status: 'UNAVAILABLE', overallScore: null };
  }
  if (
    !result ||
    result.isDeleted ||
    result.deletedAt ||
    result.applicationId !== app._id ||
    result.cvId !== app.cvId ||
    result.userId !== app.userId ||
    result.jobId !== app.jobId
  ) {
    return { status: 'MISSING', overallScore: null };
  }
  if (
    !app.cv.contentHash ||
    result.contentHash !== app.cv.contentHash ||
    !app.job ||
    !app.company ||
    app.job.isDeleted ||
    app.job.deletedAt ||
    app.company.isDeleted ||
    app.company.deletedAt ||
    app.companyId !== app.job.company?._id ||
    result.jobSourceVersion !== getJobSourceVersion(app.job, app.company) ||
    (result.status === 'COMPLETED' && !hasCurrentMatchingVersions(result))
  ) {
    return { status: 'STALE', overallScore: null };
  }
  return {
    status: result.status,
    overallScore:
      result.status === 'COMPLETED' && Number.isFinite(result.matchScore)
        ? result.matchScore
        : null,
  };
}
