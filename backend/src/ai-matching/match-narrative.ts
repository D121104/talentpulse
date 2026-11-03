import { createHash } from 'crypto';
import { CVMatchResult } from './entities/cv-match-result.entity';
import { mapHRMatchingAnalysis } from './hr-matching-analysis';
import type { MatchIdentity } from './ai-service.client';

export interface NarrativeStatement {
  text: string;
  evidence: string[];
}
export interface MatchNarrative {
  summary: NarrativeStatement;
  strengths: NarrativeStatement[];
  points_to_verify: NarrativeStatement[];
}
export class NarrativeValidationError extends Error {
  constructor(
    readonly reason:
      | 'schema'
      | 'request_binding'
      | 'statement'
      | 'evidence'
      | 'unsafe_text',
  ) {
    super('Invalid narrative response');
  }
}
interface FactComponent {
  score: number | null;
  weight: number;
  available: boolean;
}
export interface NarrativeRequest {
  identity: MatchIdentity;
  analysis_version_key: string;
  locale: 'vi' | 'en';
  narrative_version: 'match-narrative-v1';
  facts: {
    overall_score: number;
    components: Record<'semantic' | 'skills' | 'experience', FactComponent>;
    compatibility: Record<'location' | 'work_mode', FactComponent>;
    matched_skill_refs: string[];
    missing_required_skill_refs: string[];
    matched_skill_total: number;
    missing_required_skill_total: number;
    degraded: boolean;
    skill_context?: { ref: string; label: string }[];
  };
}

export function analysisVersionKey(result: CVMatchResult): string {
  const app = result.application;
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: result._id,
        applicationId: result.applicationId,
        cvId: result.cvId,
        userId: result.userId,
        jobId: result.jobId,
        contentHash: result.contentHash,
        contentVersion: result.cv?.contentVersion,
        jobSourceVersion: result.jobSourceVersion,
        scoringVersion: result.scoringVersion,
        modelVersion: result.modelVersion,
        normalizationVersion: result.normalizationVersion,
        analysis: mapHRMatchingAnalysis(result),
        overall: result.matchScore,
        status: app?.status,
        consent: app && [
          app.aiRankingConsentGranted,
          app.aiRankingConsentVersion,
          app.aiRankingConsentPolicyHash,
          app.aiRankingConsentAt,
        ],
      }),
    )
    .digest('hex');
}

export function narrativeFacts(
  result: CVMatchResult,
): NarrativeRequest['facts'] {
  const analysis = mapHRMatchingAnalysis(result);
  const strip = (c: FactComponent): FactComponent => ({
    score: c.score,
    weight: c.weight,
    available: c.available,
  });
  const matched = analysis.components.skills.available
    ? analysis.matchedSkills.slice(0, 200)
    : [];
  const missing = analysis.components.skills.available
    ? analysis.missingRequiredSkills.slice(0, 200)
    : [];
  // Only canonical technology names cross the provider boundary, not arbitrary
  // short strings (which can still contain names, addresses or instructions).
  const canonicalTechnology =
    /^(?:TypeScript|JavaScript|Java|Python|SQL|PostgreSQL|MySQL|SQLite|MongoDB|Redis|Valkey|Qdrant|Elasticsearch|OpenSearch|C|C\+\+|C#|\.NET(?: Core)?|ASP\.NET(?: Core)?|Node\.js|React(?: Native)?|Next\.js|Vue(?:\.js)?|Angular|NestJS|Express(?:\.js)?|FastAPI|Django|Flask|Spring(?: Boot)?|Go|Golang|Rust|Ruby|PHP|Laravel|Swift|Kotlin|Dart|Flutter|HTML|CSS|Sass|Tailwind CSS|Docker|Kubernetes|AWS|Azure|GCP|Amazon Web Services|Google Cloud(?: Platform)?|Git|GitHub Actions|GitLab CI|Jenkins|Terraform|Ansible|Linux|REST(?: API)?|GraphQL|gRPC|Kafka|RabbitMQ|Spark|Apache Spark|Hadoop|Airflow|dbt|Snowflake|BigQuery|Pandas|NumPy|PyTorch|TensorFlow|Scikit-learn|Machine Learning|Deep Learning|Natural Language Processing|Computer Vision|Data Analysis|Data Engineering|Power BI|Tableau|Figma|Jest|Pytest|Cypress|Playwright|Selenium|OAuth|OAuth2|JWT|LangChain|OpenCV|Unity|Unreal Engine)$/i;
  const skillContext = [
    ...matched.slice(0, 100).map((label, i) => ({ ref: `m${i}`, label })),
    ...missing.slice(0, 100).map((label, i) => ({ ref: `g${i}`, label })),
  ]
    .filter(
      ({ label }) =>
        label === label.trim() &&
        label.length <= 64 &&
        canonicalTechnology.test(label),
    )
    .slice(0, 16);
  return {
    overall_score: result.matchScore,
    components: {
      semantic: strip(analysis.components.semantic),
      skills: strip(analysis.components.skills),
      experience: strip(analysis.components.experience),
    },
    compatibility: {
      location: strip(analysis.compatibility.location),
      work_mode: strip(analysis.compatibility.workMode),
    },
    matched_skill_refs: matched.slice(0, 100).map((_, i) => `m${i}`),
    missing_required_skill_refs: missing.slice(0, 100).map((_, i) => `g${i}`),
    matched_skill_total: matched.length,
    missing_required_skill_total: missing.length,
    degraded: analysis.degraded !== false,
    ...(skillContext.length ? { skill_context: skillContext } : {}),
  };
}

export function fallbackNarrative(request: NarrativeRequest): MatchNarrative {
  const vi = request.locale === 'vi';
  const facts = request.facts;
  return {
    summary: {
      text: vi
        ? 'Đây là kết quả đối chiếu tự động, không phải kết luận tuyển dụng.'
        : 'This automated comparison is not a hiring decision.',
      evidence: ['overall'],
    },
    strengths: facts.matched_skill_refs.length
      ? [
          {
            text: vi
              ? 'Hồ sơ có bằng chứng về một số kỹ năng phù hợp.'
              : 'The profile provides evidence of some matching skills.',
            evidence: [facts.matched_skill_refs[0]],
          },
        ]
      : [],
    points_to_verify: facts.missing_required_skill_refs.length
      ? [
          {
            text: vi
              ? 'Một số kỹ năng yêu cầu chưa có bằng chứng trong hồ sơ; cần xác minh thêm.'
              : 'Some required skills are not evidenced in the profile and need verification.',
            evidence: [facts.missing_required_skill_refs[0]],
          },
        ]
      : [],
  };
}

export function validateNarrative(
  value: unknown,
  request: NarrativeRequest,
): MatchNarrative {
  const fail = (
    reason: NarrativeValidationError['reason'] = 'schema',
  ): never => {
    throw new NarrativeValidationError(reason);
  };
  const object = (v: unknown): Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fail();
  const exact = (v: Record<string, unknown>, keys: string[]) => {
    if (Object.keys(v).sort().join() !== keys.sort().join()) fail();
  };
  const data = object(value);
  exact(data, [
    'identity',
    'analysis_version_key',
    'locale',
    'narrative_version',
    'source',
    'summary',
    'strengths',
    'points_to_verify',
  ]);
  const identity = object(data.identity);
  exact(identity, Object.keys(request.identity));
  if (
    Object.entries(request.identity).some(([k, v]) => identity[k] !== v) ||
    data.analysis_version_key !== request.analysis_version_key ||
    data.locale !== request.locale ||
    data.narrative_version !== request.narrative_version ||
    data.source !== 'llm'
  )
    fail('request_binding');
  const scores: Record<string, number> = {
    overall: request.facts.overall_score,
  };
  for (const [name, c] of Object.entries({
    ...request.facts.components,
    ...request.facts.compatibility,
  }))
    if (c.available && c.score !== null) scores[name] = c.score;
  const matched = request.facts.matched_skill_refs;
  const missing = request.facts.missing_required_skill_refs;
  const all = [...Object.keys(scores), ...matched, ...missing];
  const positive = [
    ...matched,
    ...Object.keys(scores).filter((k) => scores[k] >= 0.6),
  ];
  const negative = [
    ...missing,
    ...Object.keys(scores).filter((k) => scores[k] < 0.6),
  ];
  const statement = (v: unknown, allowed: string[]): NarrativeStatement => {
    const s = object(v);
    exact(s, ['text', 'evidence']);
    if (
      typeof s.text !== 'string' ||
      !s.text.trim() ||
      [...s.text].length > 300
    )
      fail('statement');
    if (
      !Array.isArray(s.evidence) ||
      s.evidence.length < 1 ||
      s.evidence.length > 8 ||
      s.evidence.some((r) => typeof r !== 'string' || !allowed.includes(r))
    )
      fail('evidence');
    let numericText = s.text as string;
    for (const { ref, label } of request.facts.skill_context ?? []) {
      if (!(s.evidence as string[]).includes(ref)) continue;
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      numericText = numericText.replace(
        new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'),
        '',
      );
    }
    if (
      /\p{Nd}/u.test(numericText) ||
      /%|@|https?:\/\//u.test(s.text as string)
    )
      fail('unsafe_text');
    return { text: s.text as string, evidence: s.evidence as string[] };
  };
  const list = (v: unknown, allowed: string[]) => {
    if (!Array.isArray(v) || v.length > 3) return fail();
    return v.map((s) => statement(s, allowed));
  };
  return {
    summary: statement(data.summary, all),
    strengths: list(data.strengths, positive),
    points_to_verify: list(data.points_to_verify, negative),
  };
}
