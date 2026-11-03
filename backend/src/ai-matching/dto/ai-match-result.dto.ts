export interface IMatchingAnalysisComponent {
  score: number | null;
  weight: number;
  available: boolean;
  evidence: string[];
}

/** Scores/weights are 0..1; unavailable scores are null, never negative evidence. */
export interface IHRMatchingAnalysis {
  source: 'persisted_cv_match_result';
  textLocale: 'en' | 'und';
  components: Record<
    'semantic' | 'skills' | 'experience',
    IMatchingAnalysisComponent
  >;
  compatibility: Record<'location' | 'workMode', IMatchingAnalysisComponent>;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  strengths: string[];
  gaps: string[];
  versions: {
    scoring: string | null;
    model: string | null;
    normalization: string | null;
  };
  degraded: boolean | null;
  explanation: {
    text: string | null;
    source: 'deterministic_matching' | 'stored_unknown' | 'unavailable';
    locale: 'en' | 'und';
  };
}

export interface ICandidateMatchResult {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidateAvatar?: string;
  cvId: string;
  cvTitle: string;
  cvUrl: string;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  shortExplanation: string;
  analysisAvailable: boolean;
  aiAnalysis?: IHRMatchingAnalysis;
  analysisVersionKey?: string;
  applicationStatus: string;
  appliedAt: string;
}

export interface IAIRankingResponse {
  jobId: string;
  jobName: string;
  totalApplications: number;
  rankedCandidates: ICandidateMatchResult[];
  processedAt: string;
  processingStatus?: {
    total: number;
    completed: number;
    processing: number;
    pending: number;
    failed: number;
    stale?: number;
  };
}
